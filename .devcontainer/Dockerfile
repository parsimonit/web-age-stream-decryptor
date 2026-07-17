FROM docker.io/jetpackio/devbox:latest

WORKDIR /code

USER root:root
RUN mkdir -p /code && chown ${DEVBOX_USER}:${DEVBOX_USER} /code

USER ${DEVBOX_USER}:${DEVBOX_USER}

COPY --chown=${DEVBOX_USER}:${DEVBOX_USER} devbox.json devbox.json
COPY --chown=${DEVBOX_USER}:${DEVBOX_USER} devbox.lock devbox.lock

# Build the devbox environment into the image layer
RUN devbox install
RUN devbox run install-deps

# Make the environment visible to VS Code processes and login shells
RUN devbox shellenv --init-hook >> ~/.profile
RUN printf '%s\n' 'export PATH="$VENV_DIR/bin:$PATH"' >> ~/.profile
