// @val-town anchordashboard
// Redirect to main Anchor AppView site
export default async function (req: Request): Promise<Response> {
  // Redirect all traffic to the main site
  return new Response(null, {
    status: 301,
    headers: { Location: "https://anchor-feed-generator.val.run" },
  });
}