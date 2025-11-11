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
    console.log(` Pesquisando: ${nome}`);

    try {
      await page.goto("https://cnpja.com");
      await page.waitForSelector(
        'input[placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"]',
        { visible: true }
      );
      await page.click(
        'input[placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"]'
      );

      await page.type(
        'input[placeholder="Pesquisar CNPJ, razão social, nome fantasia ou sócio"]',
        nome,
        { delay: 100 }
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const sugestoesEmpresa = await page.$$eval(
        ' div[data-value="estabelecimentos"] div[role="group"] span.font-medium',
        (items) => items.map((el) => el.innerText.trim())
      );

      const sugestaoCorretaEmpresa = sugestoesEmpresa.find((s) =>
        s.toUpperCase().includes(nome.toUpperCase())
      );

      if (sugestaoCorretaEmpresa) {
        await page.evaluate((texto) => {
          const opcoes = Array.from(
            document.querySelectorAll('div[role="option"] span.font-medium')
          );
          const alvo = opcoes.find((el) =>
            el.innerText.trim().toUpperCase().includes(texto.toUpperCase())
          );
          if (alvo) {
            alvo.click();
          }
        }, sugestaoCorretaEmpresa);
      } else {
        console.log(
          " Nenhuma empresa com nome completo encontrada nas sugestões."
        );

        const sugestoesPessoa = await page.$$eval(
          ' div[data-value="sócios e administradores"] div[role="group"] span.font-medium',
          (items) => items.map((el) => el.innerText.trim())
        );

        const sugestaoCorretaPessoa = sugestoesPessoa.find((s) =>
          s.toUpperCase().includes(nome.toUpperCase())
        );

        if (sugestaoCorretaPessoa) {
          await page.evaluate((texto) => {
            const opcoesPessoa = Array.from(
              document.querySelectorAll('div[role="option"] span.font-medium')
            );
            const alvoPessoa = opcoesPessoa.find((el) =>
              el.innerText.trim().toUpperCase().includes(texto.toUpperCase())
            );
            if (alvoPessoa) {
              alvoPessoa.click();
            }
          }, sugestaoCorretaPessoa);
        } else {
          console.log(
            " Nenhuma empresa ou Socios e Administradores cadastrados no nome inserido."
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const nomeEmpresa = await page.$eval("h3", (el) => el.innerText.trim());

      const cnpjTexto = await page.$eval("li > span", (el) =>
        el.innerText.trim()
      );
      const cnpjRegex = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
      const cnpjCerto =
        cnpjTexto.match(cnpjRegex)?.[0] || "CNPJ não encontrado";

      const cnae = await page.$eval("tr > td > a ", (el) =>
        el.innerText.trim()
      );

      console.log(`Empresa: ${nomeEmpresa}`);
      console.log(`CNPJ: ${cnpjCerto}`);
      console.log(`CNAE: ${cnae}`);

      const resultado = `Empresa: ${nomeEmpresa}, CNPJ: ${cnpjCerto}, CNAE: ${cnae}`;

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
  console.log("Busca finalizada. Resultados salvos em output.csv");
}

async function escreverCSV(resultados, caminho) {
  const ws = fs.createWriteStream(caminho);
  csv.write(resultados, { headers: true }).pipe(ws);
}

buscarCNPJs();
