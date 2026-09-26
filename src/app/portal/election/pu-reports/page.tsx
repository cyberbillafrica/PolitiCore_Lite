import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function PUReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Polling Unit Reports</h1>
      <Card>
        <CardHeader><CardTitle>Your Reports</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No reports submitted yet.</p>
            <button className="mt-4 bg-apc-primary text-white px-6 py-2 rounded-lg hover:bg-apc-dark transition-colors">
              Submit New Report
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
