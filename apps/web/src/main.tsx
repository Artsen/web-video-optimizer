import React from "react";
import ReactDOM from "react-dom/client";
import { createVideoOptimizerApi } from "./api/api-client";
import { createBrowserJobEvents } from "./api/job-events";
import { App } from "./app/App";
import "./styles.css";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `${window.location.protocol}//${window.location.hostname}:4000`;

const dependencies = {
  api: createVideoOptimizerApi({ baseUrl: apiBaseUrl }),
  apiBaseUrl,
  jobEvents: createBrowserJobEvents({ baseUrl: apiBaseUrl })
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App dependencies={dependencies} />
  </React.StrictMode>
);
