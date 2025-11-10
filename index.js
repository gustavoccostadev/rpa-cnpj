import puppeteer from "puppeteer";
import fs from "fs";
import csv from "fast-csv";
import { Launcher } from "chrome-launcher";

const chromePath = Launcher.getInstallations()[0];

async function lerCSV(caminho) {
  const nomes = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(caminho)
      .pipe(csv.parse({ headers: true }))
      .on("data", (row) => nomes.push(row.nome))
      .on("end", () => resolve(nomes))
      .on("error", reject);
  });
}

async function buscarCNPJs() {
  const nomes = await lerCSV("input.csv");
  const resultados = [];

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
  });
  const page = await browser.newPage();

  for (const nome of nomes) {
    console.log(`🔍 Pesquisando: ${nome}`);

    try {
      await page.goto("https://cnpja.com");
      await page.waitForSelector(
        'input[placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"]',
        { visible: true, timeout: 10000 }
      );
      await page.click(
        'input[placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"]'
      );

      await page.type(
        'input[placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"]',
        nome + " CNPJ",
        { delay: 100 }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const resultado = await page.evaluate(() => {
        const texto = document.body.innerText;

        const cnpjRegex = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
        let cnpjs = texto.match(cnpjRegex);

        if (cnpjs && cnpjs.length > 0) {
          const cnpjIndesejado = "37.335.118/0001-80";
          cnpjs = cnpjs.filter((c) => !c.includes(cnpjIndesejado));

          if (cnpjs.length > 0) {
            return `CNPJs encontrados: ${cnpjs.join(", ")}`;
          }
        }

        return null;
      });

      if (resultado) {
        resultados.push({ nome, resultado, status: "Encontrado" });
      } else {
        resultados.push({
          nome,
          resultado: "Nenhum CNPJ ou empresa encontrada",
          status: "Não encontrado",
        });
      }
    } catch (err) {
      console.error(`Erro ao pesquisar ${nome}:`, err.message);
      resultados.push({ nome, resultado: "Erro na busca", status: "Erro" });
    }
  }

  await browser.close();

  await escreverCSV(resultados, "output.csv");
  console.log("✅ Busca finalizada. Resultados salvos em output.csv");
}

async function escreverCSV(resultados, caminho) {
  const ws = fs.createWriteStream(caminho);
  csv.write(resultados, { headers: true }).pipe(ws);
}

buscarCNPJs();
