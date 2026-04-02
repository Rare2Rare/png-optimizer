import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import ja from "./ja.json";

const savedLang = localStorage.getItem("lang") || "ja";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: savedLang,
  fallbackLng: "ja",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
