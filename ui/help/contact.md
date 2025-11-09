# Contact Lookup Page Instructions

Use this page when you need to jump straight into a detailed contact record (often from a QR code or direct link).

## Steps
1. Load the link with the voter’s parameters (prefilled via URL).
2. Review the summary card—address, party, recent outcomes.
3. Fill out the outcome form (contact type, support level, notes, tags).
4. **Capture contact channels & Pulse consent** – Confirm the voter’s preferred cell phone and email. Ask whether they want occasional Pulse texts/emails with polling-place directions, district candidate links, and voting-date reminders, then log both the contact info and the opt-in. Script: _“With your permission we can send brief campaign updates by text or email. Message/data rates may apply and you can reply STOP any time. Is that okay?”_
5. Submit the result to save it to the Worker API; you’ll see a confirmation toast.
6. Follow the return link to get back to your list or dashboard.

## Notes
- If any required field is missing from the URL, the page will prompt you to look up the voter before logging.
- Never share this link publicly; it expects you to be within Cloudflare Access.
- Note opt-outs immediately so future volunteers skip the Pulse ask for that voter.
