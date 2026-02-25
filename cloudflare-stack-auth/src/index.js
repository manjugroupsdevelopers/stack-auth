import { Container, getContainer } from "@cloudflare/containers";

export class StackAuthContainer extends Container {
  defaultPort = 8102;
  sleepAfter = "15m";
}

export default {
  async fetch(request, env) {
    // Get a container instance - using a single instance for all requests
    const container = getContainer(env.STACK_AUTH_CONTAINER, "main");
    
    // Forward the request to the container
    return container.fetch(request);
  },
};
