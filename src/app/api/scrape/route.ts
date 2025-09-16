import { scrapeUFCData } from '@/lib/actions';

export async function POST(request: Request) {
  const formData = await request.formData();
  
  // Create a ReadableStream to send logs to the client
  const stream = new ReadableStream({
    async start(controller) {
      // The `onLog` function will be called by `scrapeUFCData` to send logs
      const onLog = async (log: string) => {
        controller.enqueue(JSON.stringify({ log }) + '\n');
      };

      const onIdCreated = async (id: number) => {
        controller.enqueue(JSON.stringify({ extractionId: id }) + '\n');
      };

      // Call the main scraping function, passing the new callback
      const result = await scrapeUFCData(formData, onLog, onIdCreated);

      // Send the final result when the process is finished
      controller.enqueue(JSON.stringify({ finalResult: result }) + '\n');
      
      // Close the stream
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
