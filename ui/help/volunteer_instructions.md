<!-- File: ui/help/volunteer_instructions.md -->

# Volunteer Instructions

These instructions cover the four core pages of our volunteer hub and align with our stack: Cloudflare Pages UI at `volunteers.grassrootsmvt.org`, a same-origin Worker API at `/api/*`, and D1 for data. Same origin keeps sign-in smooth and avoids CORS issues so the focus stays on conversations.

---

## 1) Landing Page: Welcome and Orientation
**Path:** `ui/index.html` or `ui/hub/index.html`  
**Primary goals:**  
1) Introduce the candidate to registered voters  
2) Point volunteers to Canvass, Call, and Update flows

### Overview
The landing page is the front door. It confirms sign-in, links to the three work pages, and sets expectations for respectful outreach. The UI calls the API at the same origin, so buttons route to `/api/...` behind Access when needed.

### Purpose
Welcome new volunteers, orient returning volunteers, and send everyone to the right task in one click.

### Elevator pitch
> “Hi, I’m a local volunteer saying hello. We’re introducing our candidate across town and listening first. With your permission, I’d like to confirm your voter info and share a short update. Two minutes is perfect.”

### What to do
- Confirm you can reach `/api/whoami` after Access sign-in  
- Choose a task: **Canvass**, **Call**, or **Update**  
- Keep all links same-origin so the Access cookie carries through

### Outcome
You are signed in and routed to the chosen task with no redirect or CORS errors.

---

## 2) Canvass Page: In-person Notes and Opt-ins
**Path:** `ui/volunteer/canvass.html`  
**Primary goals:**  
1) Introduce the candidate to registered voters  
2) Get Pulse text-message opt-in permission  
3) Record comments and update contact details  
4) Gather feedback on the app

### Overview
This page is for door-to-door or in-person conversations. It uses the Worker API and D1 to find the right record, log outcomes, and capture texting consent.

### Purpose
Hold a short, respectful conversation, verify the voter match, log what matters, and secure explicit permission for text updates if welcome.

### Elevator pitch
> “We’re neighbors working together. May I confirm your name and address, share a one-minute intro, and, if helpful, send an occasional text update with your permission?”

### What to collect
- Confirmed voter match and any updates to name, phone, email, or address  
- Short notes on issues that matter to the voter  
- **Pulse opt-in**: first and last name, mobile number, permission statement, date and time, and the volunteer’s initials

### Steps
1) Search by name or address and confirm the match using normalized address data  
2) Share the one-minute candidate intro  
3) Ask for text-update permission and record consent if granted  
4) Record notes and any data corrections

**Consent script to read verbatim**
> “With your permission, we can send occasional campaign texts. Message and data rates may apply. Reply STOP at any time to end. Is that okay?”

### Outcome
A saved canvass record, a valid Pulse opt-in when granted, and clear comments for follow-up.

### Field tips
- Confirm the address before collecting opinions  
- Keep the ask small, then listen  
- If texting is declined, record the preference and move on

---

## 3) Update Page: Contact Corrections and Comments
**Path:** `ui/contact-form/index.html`  
**Primary goals:**  
1) Update voter information and record comments  
2) Log consent if texting permission is granted here  
3) Gather feedback on how to improve the app

### Overview
This page is the maintenance lane. It collects corrections for phone, email, and address and stores short comments for the follow-up team. Same-origin calls ensure Access works cleanly.

### Purpose
Keep records accurate, respect consent, and deliver comments to the right team.

### Elevator pitch
> “Help us keep records accurate so we do not waste time or inbox space. With your okay, we will send only important texts, and you can opt out any time.”

### What to collect
- Correct phone and email  
- Address corrections verified against the city and street index  
- Consent status for texting, stored the same way as the canvass flow  
- A brief comment from the voter, plus volunteer notes

### Outcome
Updated contact fields reflected in D1 and ready for calling and texting assignments.

---

## 4) Call Page: Phone Conversations and Follow-ups
**Path:** `ui/volunteer/phone.html` (primary) or `ui/call.html` (legacy)  
**Primary goals:**  
1) Introduce the candidate to registered voters  
2) Offer the Pulse text-update option and record consent  
3) Update voter info and record comments  
4) Gather feedback on the call and the app experience

### Overview
This page supports one-to-one phone outreach tied to call activity and contact tables. It uses the same sign-in and same-origin pattern as the other pages.

### Purpose
Reach voters efficiently, keep calls short, earn consent for text updates, and capture accurate notes for the next touch.

### Elevator pitch
> “Calling with a brief local update. We are keeping it short and useful. With your okay, we will text an occasional update so you can skim and reply when it is convenient.”

### Call flow
1) Confirm the voter match  
2) Give the one-minute intro and one relevant issue  
3) Ask for texting permission and save consent if granted  
4) Update phone or email if offered  
5) Record call disposition and notes for follow-up

**Consent script to read verbatim**
> “With your permission, we can send occasional campaign texts. Message and data rates may apply. Reply STOP at any time to end. Is that okay?”

### Outcome
A saved call disposition, accurate notes, and a valid opt-in record when consent is granted.

---

## Quality, Privacy, and Consistency

- **Same origin:** Call `/api/...` from the same domain to avoid CORS and redirect loops. Do not hardcode external API hosts in page code  
- **Access and identity:** Let Cloudflare Access set the session, then read `/api/whoami` to confirm  
- **Address normalization:** Use the city and street indexes so updates stay consistent across pages  
- **Feedback:** Every interaction ends with two questions:
  1) “What did you hope we would ask that we missed today?”  
  2) “Would a short text now and then be helpful, and may we have your permission for that?”
