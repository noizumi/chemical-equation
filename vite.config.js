import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

// 学校の古い iPad (iOS/iPadOS 12 以降) でも動くようにレガシービルドを併用する
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["defaults", "iOS >= 12", "Safari >= 12"],
    }),
  ],
  build: { target: "es2015" },
});
