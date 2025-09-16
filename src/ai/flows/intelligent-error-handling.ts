'use server';

/**
 * @fileOverview An intelligent error handling AI agent.
 *
 * - analyzeError - A function that analyzes errors and determines if they can be resolved automatically.
 * - AnalyzeErrorInput - The input type for the analyzeError function.
 * - AnalyzeErrorOutput - The return type for the analyzeError function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AnalyzeErrorInputSchema = z.object({
  errorMessage: z
    .string()
    .describe('The error message that needs to be analyzed.'),
  context: z.string().describe('The context in which the error occurred.'),
});
export type AnalyzeErrorInput = z.infer<typeof AnalyzeErrorInputSchema>;

const AnalyzeErrorOutputSchema = z.object({
  canResolveAutomatically: z
    .boolean()
    .describe(
      'Whether the error can be resolved automatically or requires user intervention.'
    ),
  resolutionMessage: z
    .string()
    .describe(
      'A message indicating the recommended resolution, or an error message if automatic resolution is not possible or the LLM is unsure.'
    ),
});
export type AnalyzeErrorOutput = z.infer<typeof AnalyzeErrorOutputSchema>;

export async function analyzeError(
  input: AnalyzeErrorInput
): Promise<AnalyzeErrorOutput> {
  return analyzeErrorFlow(input);
}

const analyzeErrorPrompt = ai.definePrompt({
  name: 'analyzeErrorPrompt',
  input: {schema: AnalyzeErrorInputSchema},
  output: {schema: AnalyzeErrorOutputSchema},
  prompt: `You are an intelligent error analysis agent designed to determine if an error can be automatically resolved.
  Given an error message and the context in which it occurred, analyze the error and determine if it can be resolved automatically.
  If the error can be resolved automatically, set canResolveAutomatically to true and provide a resolutionMessage with instructions on how to resolve the error.
  If the error cannot be resolved automatically or you are unsure, set canResolveAutomatically to false and provide a resolutionMessage that is a descriptive error message to be displayed to the user.

  Error Message: {{{errorMessage}}}
  Context: {{{context}}}

  Consider these common error scenarios:
  - Network connectivity issues: Suggest checking the internet connection.
  - Timeout errors: Suggest increasing the timeout duration or retrying the operation.
  - Element not found errors: Suggest verifying the element's existence or waiting for it to load.
  - Invalid input errors: Suggest correcting the input data.

  Prioritize automatic resolution where possible, but err on the side of caution and provide a descriptive error message if unsure.
  Ensure to keep the resolution message concise and user-friendly.`,
});

const analyzeErrorFlow = ai.defineFlow(
  {
    name: 'analyzeErrorFlow',
    inputSchema: AnalyzeErrorInputSchema,
    outputSchema: AnalyzeErrorOutputSchema,
  },
  async input => {
    const {output} = await analyzeErrorPrompt(input);
    return output!;
  }
);
