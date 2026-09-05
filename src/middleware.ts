import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Only the marketing/landing and recorder pages are public; every API route
// requires a real Clerk session (no more unauthenticated extension bypass).
const isPublicRoute = createRouteMatcher(["/", "/new"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
