import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App"; // Corrected import path
import { I18nProvider } from "./i18n";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
