import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, RefreshCw } from "lucide-react";

const monitoringData = [
  {
    asset: "ETH-USD",
    price: "$3,245.67",
    oraclePrice: "$3,244.12",
    deviation: "0.05%",
    fundingRate: "0.01%",
    skew: "0.12",
    volatility: "2.4%",
    status: "Normal",
  },
  {
    asset: "BTC-USD",
    price: "$64,123.45",
    oraclePrice: "$64,100.20",
    deviation: "0.04%",
    fundingRate: "0.008%",
    skew: "-0.05",
    volatility: "1.8%",
    status: "Normal",
  },
  {
    asset: "SOL-USD",
    price: "$145.89",
    oraclePrice: "$144.50",
    deviation: "0.96%",
    fundingRate: "0.05%",
    skew: "0.45",
    volatility: "5.6%",
    status: "Warning",
  },
  {
    asset: "SUI-USD",
    price: "$1.89",
    oraclePrice: "$1.82",
    deviation: "3.8%",
    fundingRate: "0.12%",
    skew: "0.78",
    volatility: "12.4%",
    status: "Emergency",
  },
  {
    asset: "ARB-USD",
    price: "$1.12",
    oraclePrice: "$1.12",
    deviation: "0.00%",
    fundingRate: "0.02%",
    skew: "0.02",
    volatility: "3.1%",
    status: "Normal",
  },
];

export default function Monitoring() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Market Monitoring</h2>
          <p className="text-muted-foreground">Detailed asset performance and risk metrics.</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search asset..." className="pl-8 bg-background/50 border-primary/20" />
          </div>
          <Button variant="outline" size="icon" className="border-primary/50 text-primary">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="border-primary/50 text-primary">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardHeader>
          <CardTitle className="text-primary">Live Asset Data</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-primary/20 hover:bg-transparent">
                <TableHead className="text-primary">Asset</TableHead>
                <TableHead className="text-right text-primary">Mark Price</TableHead>
                <TableHead className="text-right text-primary">Oracle Price</TableHead>
                <TableHead className="text-right text-primary">Deviation</TableHead>
                <TableHead className="text-right text-primary">Funding (1h)</TableHead>
                <TableHead className="text-right text-primary">Skew</TableHead>
                <TableHead className="text-right text-primary">Vol (1h)</TableHead>
                <TableHead className="text-center text-primary">Status</TableHead>
                <TableHead className="text-right text-primary">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monitoringData.map((row) => (
                <TableRow key={row.asset} className="border-primary/10 hover:bg-primary/5 transition-colors">
                  <TableCell className="font-medium flex items-center gap-2">
                    {row.asset.includes("ETH") && <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663310129808/gDzSqimYyGeF88WXsXbYmx/asset-icon-eth_599a638d.jpg" className="w-6 h-6 rounded-full object-cover border border-primary/30" />}
                    {row.asset.includes("BTC") && <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663310129808/gDzSqimYyGeF88WXsXbYmx/asset-icon-btc_83938301.jpg" className="w-6 h-6 rounded-full object-cover border border-primary/30" />}
                    {!row.asset.includes("ETH") && !row.asset.includes("BTC") && <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px]">{row.asset.substring(0,1)}</div>}
                    {row.asset}
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.price}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{row.oraclePrice}</TableCell>
                  <TableCell className={`text-right font-mono ${parseFloat(row.deviation) > 1 ? 'text-destructive' : 'text-primary'}`}>
                    {row.deviation}
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.fundingRate}</TableCell>
                  <TableCell className="text-right font-mono">{row.skew}</TableCell>
                  <TableCell className="text-right font-mono">{row.volatility}</TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant="outline" 
                      className={`
                        ${row.status === 'Normal' ? 'border-primary text-primary bg-primary/10' : 
                          row.status === 'Warning' ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : 
                          'border-destructive text-destructive bg-destructive/10 animate-pulse'}
                      `}
                    >
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 text-primary hover:text-primary hover:bg-primary/10">
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
