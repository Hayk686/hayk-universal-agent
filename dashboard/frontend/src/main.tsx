import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initApiRoutingForHost } from "./lib/api-base";
import "./index.css";

initApiRoutingForHost();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
