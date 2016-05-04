FROM node:latest

# Global machine config
RUN npm install -g gulp bower

# Lush dependencies
RUN mkdir /lush-client
WORKDIR /lush-client
ADD . .
RUN npm install
RUN bower --allow-root install

# The docker command is the building of source code. This allows reusing the
# image to build updated source code using volume mapping (and using docker cp
# to get the results out if not using docker run --rm).
CMD gulp
