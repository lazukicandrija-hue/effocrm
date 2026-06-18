// Middleware: protect all routes except login and API auth
export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/accounts/:path*",
    "/reels/:path*",
    "/models/:path*",
    "/team/:path*",
    "/settings/:path*",
  ],
};
