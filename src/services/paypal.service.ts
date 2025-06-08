import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AnonymizeUaPlugin from "puppeteer-extra-plugin-anonymize-ua";
import axios from "axios";
import dotenv from "dotenv";
import path from 'path';
dotenv.config();

// Підключаємо плагіни перед launch()
puppeteer.use(StealthPlugin());
puppeteer.use(
  AnonymizeUaPlugin({
    customFn: (ua) => ua.replace(/HeadlessChrome/, "Chrome"),
  })
);

export async function getPayPalUAHExchangeRate(): Promise<string> {
  const { PAYPAL_LOGIN, PAYPAL_PASSWORD } = process.env;
  if (!PAYPAL_LOGIN || !PAYPAL_PASSWORD) {
    throw new Error("Встановіть ENV PAYPAL_LOGIN і PAYPAL_PASSWORD");
  }

  const converterUrl =
    "https://www.paypal.com/businesswallet/currencyConverter/USD";

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: path.join(
      "/Users/revorved/Library/Application Support/Google/Chrome/Profile 8"
    ),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const page = await browser.newPage();
  // Людські параметри
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    // Приховуємо webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    // Моделюємо мови
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
    // Плагіни
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  let csrfToken: string | null = null;
  let endpointUrl: string | null = null;

  // Перехоплюємо POST до exchangedetails
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (
      req.method() === "POST" &&
      req.url().includes("/businesswallet/api/exchangedetails") &&
      !csrfToken
    ) {
      const body = JSON.parse(req.postData()!);
      csrfToken = body._csrf;
      endpointUrl = req.url();
    }
    req.continue();
  });

  // 1) Заходимо на конвертер (або редірект на логін)
  await page.goto(converterUrl, { waitUntil: "networkidle2" });

  // 2) Двоетапна форма логіну
  if (page.url().includes("/signin")) {
    // Email
    await page.waitForSelector('input[name="login_email"]', {
      visible: true,
    });
    await page.type('input[name="login_email"]', PAYPAL_LOGIN, {
      delay: randomDelay(100, 200),
    });
    await page.click('button[type="submit"]');
    // Пароль
    await page.waitForSelector('input[name="login_password"]', {
      visible: true,
    });
    await page.type('input[name="login_password"]', PAYPAL_PASSWORD, {
      delay: randomDelay(100, 200),
    });
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });
  }

  // 3) Знову на конвертер, чекаємо перехоплення
  await page.goto(converterUrl, { waitUntil: "networkidle2" });
  await new Promise((resolve) => setTimeout(resolve, randomDelay(1000, 2000)));

  if (!csrfToken || !endpointUrl) {
    await browser.close();
    throw new Error("Не вдалося перехопити CSRF-токен або URL ендпоінта");
  }

  // 4) Збираємо куки для Axios
  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  await browser.close();

  // 5) Робимо фактичний POST через Axios
  const resp = await axios.post(
    endpointUrl,
    {
      _csrf: csrfToken,
      params: {
        fromCurrCode: "USD",
        toCurrCode: "UAH",
        fromCurrValue: "100",
      },
    },
    {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Origin: "https://www.paypal.com",
        Referer: converterUrl,
        Cookie: cookieHeader,
        "Accept-Language": "en-US,en;q=0.9",
      },
    }
  );

  if (resp.data && resp.data.exchangeRate) {
    return resp.data.exchangeRate;
  } else {
    throw new Error(
      "Несподіваний формат відповіді: " + JSON.stringify(resp.data)
    );
  }
}

function randomDelay(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}