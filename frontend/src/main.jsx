import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WeatherDashboard from "@/components/WeatherDashboard.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <main className="sky-bg min-h-screen">
      <WeatherDashboard />
    </main>
  </StrictMode>
);
