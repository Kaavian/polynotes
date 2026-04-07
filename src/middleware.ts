import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// We leave the process endpoint safely unshackled to allow the external MV3 Extension context to seamlessly push blobs natively without requiring complex Chrome.Identity WebOAuth flows for the MVP.
const isPublicRoute = createRouteMatcher(["/", "/api/meetings/process(.*)", "/new"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
