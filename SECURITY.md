# Security policy

## What this project is

A static, client-side site. `npm run build` produces `dist/` — HTML, CSS, JS, fonts and
one SVG — which is served by any static host. There is:

- no server-side code, no API, no database, no authentication, no cookies;
- no user input is transmitted anywhere (the booking action is outbound contact);
- no analytics, trackers or third-party runtime scripts loaded from a CDN.

Because of that, the realistic security surface is **(1)** a malicious dependency in the
build, **(2)** a supply-chain compromise of the deployment workflow, and **(3)** a
content-injection bug in the page's own DOM code. Please report all three.

## Supported versions

Only the tip of `main` is supported. There are no release branches and no back-ports;
fixes ship as a new commit.

## Reporting a vulnerability

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository
(the *Report a vulnerability* button under the Security tab). That opens a private
advisory visible only to maintainers. Please do not open a public issue for a suspected
vulnerability.

Include: what you found, how to reproduce it, the affected file or dependency, and the
worst case you can imagine it enabling.

## What to expect

Best-effort, no formal SLA — this is a small studio site, not a product with a security
team. Acknowledgement within a few days, and I will tell you plainly whether I intend to
fix it, whether it is out of scope, or whether I need more information.

## Dependency updates

`dependabot.yml` opens grouped weekly pull requests for npm and GitHub Actions. Major
bumps of `three` and `vite` arrive on their own because they can change rendering or
build output; review them against the harness results, not just against a green build.
