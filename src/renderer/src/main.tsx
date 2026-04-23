import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App"; // Corrected import path
import { I18nProvider } from "./i18n";
import "./styles/app.css";

console.log("[Renderer] main.tsx executing...");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
