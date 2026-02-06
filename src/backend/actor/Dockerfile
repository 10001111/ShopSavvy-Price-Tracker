FROM apify/actor-node:20
COPY . ./
RUN npm install --quiet --omit=dev && (npm list || true)
CMD ["npm", "start"]
