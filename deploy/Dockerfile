FROM nginx:alpine

# Static site for TERRASCAN. All paths are relative; three.js is vendored.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# This Docker build ignores .dockerignore (both root and Dockerfile.dockerignore),
# so we WHITELIST only the runtime site assets explicitly. That keeps node_modules,
# .git, the dev bake scripts, package.json, notes/, shots/, media/ out of the image
# (correctness + size) instead of copying everything and deleting after.
COPY index.html CNAME .nojekyll /usr/share/nginx/html/
COPY css     /usr/share/nginx/html/css
COPY js      /usr/share/nginx/html/js
COPY data    /usr/share/nginx/html/data
COPY vendor  /usr/share/nginx/html/vendor
COPY assets  /usr/share/nginx/html/assets

# Source files arrive with restrictive perms (0660/0770, no "other" read bit).
# nginx's worker runs as the unprivileged "nginx" user and would otherwise get
# HTTP 403. Normalise to world-readable.
RUN chmod -R a+rX /usr/share/nginx/html
