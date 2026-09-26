'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp } from 'lucide-react';

export default function AdminReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-apc-primary" />
              <span>Engagement Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Member registrations, task completions, points earned.</p>
            <div className="mt-4 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-12 w-12 text-gray-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-apc-primary" />
              <span>Ward Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Top‑performing wards by volunteer sign‑ups and points.</p>
            <div className="mt-4 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-12 w-12 text-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-gray-500">Detailed charts and exportable reports will be available in the next update.</p>
    </div>
  );
}

