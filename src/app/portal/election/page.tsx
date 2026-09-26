// src/app/portal/election/page.tsx (Election Operations Dashboard)
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AlertCircle, CheckCircle2, Upload, AlertTriangle } from "lucide-react";

const partyColors = {
  APC: "#1B4F72",
  PDP: "#27AE60",
  NDC: "#E74C3C",
};

const wardResults = [
  { ward: "Agbani", APC: 4520, PDP: 3890, NDC: 2100 },
  { ward: "Akpugo", APC: 3780, PDP: 4100, NDC: 1890 },
  { ward: "Ozalla", APC: 5230, PDP: 3450, NDC: 1670 },
  { ward: "Amurri", APC: 2890, PDP: 3100, NDC: 2340 },
  { ward: "Obeagu", APC: 3450, PDP: 2980, NDC: 1890 },
];

const totalResults = {
  totalVotes: 45230,
  apc: 21870,
  pdp: 17520,
  NDC: 5840,
  reportedUnits: 145,
  totalUnits: 200,
  reportedWards: 15,
  totalWards: 15,
};

export default function ElectionDashboard() {
  const [electionMode] = useState("active"); // This would come from admin settings

  if (electionMode !== "active") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-10 w-10 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Election Mode Inactive
          </h2>
          <p className="text-gray-600 max-w-md">
            This module becomes available during election operations. Contact
            your administrator to activate election mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Election Operations Dashboard
        </h1>
        <p className="text-gray-600 mt-1">
          Real-time election results monitoring
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700">
                  Reported PUs
                </p>
                <p className="text-3xl font-bold text-green-800 mt-1">
                  {totalResults.reportedUnits}/{totalResults.totalUnits}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Wards Reported
                </p>
                <p className="text-3xl font-bold text-apc-primary mt-1">
                  {totalResults.reportedWards}/{totalResults.totalWards}
                </p>
              </div>
              <Upload className="h-8 w-8 text-apc-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">
                  Total Votes Cast
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {totalResults.totalVotes.toLocaleString()}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">APC Lead</p>
              <p className="text-3xl font-bold text-green-600">
                +{totalResults.apc - totalResults.pdp}
              </p>
              <p className="text-sm text-green-600 mt-1">votes ahead</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ward by Ward Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wardResults}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="ward" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="APC" fill={partyColors.APC} />
                  <Bar dataKey="PDP" fill={partyColors.PDP} />
                  <Bar dataKey="NDC" fill={partyColors.NDC} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vote Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "APC", value: totalResults.apc },
                      { name: "PDP", value: totalResults.pdp },
                      { name: "NDC", value: totalResults.NDC },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label
                  >
                    {[
                      { name: "APC", value: totalResults.apc },
                      { name: "PDP", value: totalResults.pdp },
                      { name: "NDC", value: totalResults.NDC },
                    ].map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "APC"
                            ? partyColors.APC
                            : entry.name === "PDP"
                              ? partyColors.PDP
                              : partyColors.NDC
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ward Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ward Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Ward</th>
                  <th className="text-right py-3 px-4">APC</th>
                  <th className="text-right py-3 px-4">PDP</th>
                  <th className="text-right py-3 px-4">NDC</th>
                  <th className="text-right py-3 px-4">Total</th>
                  <th className="text-right py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {wardResults.map((ward) => (
                  <tr key={ward.ward} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">{ward.ward}</td>
                    <td className="text-right py-3 px-4">
                      {ward.APC.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4">
                      {ward.PDP.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4">
                      {ward.NDC.toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4 font-medium">
                      {(ward.APC + ward.PDP + ward.NDC).toLocaleString()}
                    </td>
                    <td className="text-right py-3 px-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Complete
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold bg-gray-50">
                  <td className="py-3 px-4">Total</td>
                  <td className="text-right py-3 px-4">
                    {totalResults.apc.toLocaleString()}
                  </td>
                  <td className="text-right py-3 px-4">
                    {totalResults.pdp.toLocaleString()}
                  </td>
                  <td className="text-right py-3 px-4">
                    {totalResults.NDC.toLocaleString()}
                  </td>
                  <td className="text-right py-3 px-4">
                    {totalResults.totalVotes.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

