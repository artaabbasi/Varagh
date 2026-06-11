import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fa from "./locales/fa.json";

function applyLangToDocument(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "fa" ? "rtl" : "ltr";
}

export function initI18n() {
  const savedLang = localStorage.getItem("varagh-lang") ?? "fa";

  void i18next.use(initReactI18next).init({
    lng: savedLang,
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      fa: { translation: fa },
    },
    interpolation: { escapeValue: false },
  });

  applyLangToDocument(savedLang);

  i18next.on("languageChanged", (lng) => {
    localStorage.setItem("varagh-lang", lng);
    applyLangToDocument(lng);
  });
}
