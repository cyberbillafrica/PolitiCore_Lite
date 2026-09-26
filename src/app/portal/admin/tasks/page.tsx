'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';

export default function AdminTasksPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <button className="flex items-center space-x-2 bg-apc-primary text-white px-4 py-2 rounded-lg hover:bg-apc-dark transition-colors">
          <Plus className="h-5 w-5" />
          <span>Create Task</span>
        </button>
      </div>

      <Card>
        <CardHeader><CardTitle>All Tasks</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <p className="font-medium">Share campaign video on Facebook</p>
                <p className="text-sm text-gray-500">Facebook · Share · 50 points</p>
              </div>
              <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Active</span>
            </div>
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <p className="font-medium">Like post on X</p>
                <p className="text-sm text-gray-500">X · Like · 25 points</p>
              </div>
              <span className="inline-block bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Active</span>
            </div>
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <p className="font-medium">Comment on Instagram reel</p>
                <p className="text-sm text-gray-500">Instagram · Comment · 30 points</p>
              </div>
              <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Expired</span>
            </div>
          </div>
          <p className="text-center text-gray-500 mt-6">Task creation form will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}

