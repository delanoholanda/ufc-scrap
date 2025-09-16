import { scrapeUFCData } from '@/lib/actions';
import { saveLog } from '@/lib/database';

export async function POST(request: Request) {
  const formData = await request.formData();
  
  let currentExtractionId: number | null = null;
  
  const stream = new ReadableStream({
    async start(controller) {
      const onLog = async (log: string) => {
        controller.enqueue(JSON.stringify({ log }) + '\n');
        if (currentExtractionId) {
            saveLog(currentExtractionId, log);
        }
      };

      const onIdCreated = async (id: number) => {
        currentExtractionId = id; // Store the ID to use for logging
        controller.enqueue(JSON.stringify({ extractionId: id }) + '\n');
      };

      const result = await scrapeUFCData(formData, onLog, onIdCreated);

      controller.enqueue(JSON.stringify({ finalResult: result }) + '\n');
      
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
