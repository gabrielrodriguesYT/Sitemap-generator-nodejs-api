import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// Função para rastrear o site e gerar sitemap
async function crawlSite(baseUrl, limit = 100) {
  const visited = new Set();
  const toVisit = [baseUrl];
  const pages = [];

  while (toVisit.length && visited.size < limit) {
    const currentUrl = toVisit.shift();
    if (visited.has(currentUrl)) continue;

    visited.add(currentUrl);

    try {
      const response = await axios.get(currentUrl, { timeout: 8000 });
      const $ = cheerio.load(response.data);

      let lastmod = response.headers["last-modified"];
      if (!lastmod) lastmod = new Date().toISOString().split("T")[0];
      else lastmod = new Date(lastmod).toISOString().split("T")[0];

      pages.push({
        loc: currentUrl,
        lastmod,
      });

      const links = $("a[href]")
        .map((_, a) => new URL($(a).attr("href"), baseUrl).href)
        .get()
        .filter(
          (href) =>
            href.startsWith(baseUrl) &&
            !visited.has(href) &&
            !href.includes("#") &&
            !href.includes("mailto:")
        );

      toVisit.push(...links);
    } catch (err) {
      console.warn("Erro ao rastrear", currentUrl, err.message);
    }
  }
  return pages;
}

// Gera o XML do sitemap
function buildSitemap(pages, options) {
  const xmlEntries = pages
    .map(
      (page) => `
  <url>
    <loc>${page.loc}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${options.changeFreq}</changefreq>
    <priority>${options.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
}

// Endpoint principal
app.post("/generate-sitemap", async (req, res) => {
  const { url, changeFreq, priority } = req.body;
  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "URL inválida" });
  }

  try {
    const pages = await crawlSite(url, 100);
    const sitemap = buildSitemap(pages, { changeFreq, priority });
    res.setHeader("Content-Type", "application/xml");
    res.send(sitemap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar sitemap" });
  }
});

app.listen(3000, () => console.log("Servidor rodando em http://localhost:3000"));
