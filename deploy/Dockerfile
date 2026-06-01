FROM nginx:alpine

# Static site for TERRASCAN. All paths are relative; three.js is vendored.
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the site into the nginx web root. The .dockerignore in the build
# context (repo root) excludes .git, node_modules, deploy/, shots/, etc.
COPY . /usr/share/nginx/html

# Remove the stray deploy/ dir (only nginx.conf survives .dockerignore, and it
# is already installed to /etc/nginx) so it is not served from the web root.
RUN rm -rf /usr/share/nginx/html/deploy \
    # Source files arrive with restrictive perms (0660/0770, no "other" read
    # bit). nginx's worker runs as the unprivileged "nginx" user and would
    # otherwise get HTTP 403. Normalise to world-readable.
    && chmod -R a+rX /usr/share/nginx/html
