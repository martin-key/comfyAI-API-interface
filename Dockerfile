# Use an official Node.js runtime as the base image
FROM node:18

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the application source code to the working directory
COPY . .

# Expose the port the application listens on
EXPOSE 3000

# Define the command to run the application
CMD ["npm", "start"]
