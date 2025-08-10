// @val-town pdsCrawler
// Cron job: Runs every 1 minute to crawl registered users' PDSs for app.dropanchor.checkin records
// This replaces the old Jetstream poller with a privacy-focused approach

// Re-export the PDS crawler as the default export for Val Town cron
export { default } from "./pds-crawler.ts";
