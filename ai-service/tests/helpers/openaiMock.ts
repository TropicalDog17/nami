export class OpenAIMock {
  public responses: Array<{ content: string }> = [];
  constructor(responses?: Array<{ content: string }>) {
    if (responses) this.responses = responses;
  }
  chat = {
    completions: {
      create: async (_req: any) => {
        const resp = this.responses.shift() || { content: "" };
        return {
          choices: [{ message: { content: resp.content } }],
        };
      },
    },
  };
}
