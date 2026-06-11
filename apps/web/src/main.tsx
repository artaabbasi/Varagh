import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { initI18n } from "./app/i18n";
import "./theme/tokens.css";

initI18n();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
