import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function IncidentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Incident Reports</h1>
      <Card>
        <CardHeader><CardTitle>Reported Incidents</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No incidents reported.</p>
            <button className="mt-4 bg-apc-primary text-white px-6 py-2 rounded-lg hover:bg-apc-dark transition-colors">
              Report an Incident
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
