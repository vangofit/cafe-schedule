import type { MetadataRoute } from "next";

// 폰 홈 화면에 추가하면 앱처럼 열린다
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "월영당 근무표",
    short_name: "월영당 근무표",
    description: "월영당 근무표 자동 편성과 휴무·연차 요청",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f1e7",
    theme_color: "#1b2235",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
