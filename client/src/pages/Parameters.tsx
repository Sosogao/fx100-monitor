import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Save, RotateCcw, Info } from "lucide-react";

export default function Parameters() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Risk Parameters</h2>
          <p className="text-muted-foreground">Configure global and asset-specific risk controls.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Defaults
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList className="bg-card/50 border border-primary/20">
          <TabsTrigger value="global" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Global Config</TabsTrigger>
          <TabsTrigger value="assets" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Asset Specific</TabsTrigger>
          <TabsTrigger value="emergency" className="data-[state=active]:bg-destructive/20 data-[state=active]:text-destructive">Emergency Protocols</TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-card/50 border-primary/20 tech-border">
              <CardHeader>
                <CardTitle className="text-primary">Funding Rate Limits</CardTitle>
                <CardDescription>Global constraints for funding rate calculations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Max Funding Rate (Hourly)</Label>
                  <div className="flex items-center gap-4">
                    <Slider defaultValue={[0.5]} max={5} step={0.1} className="flex-1" />
                    <span className="font-mono text-primary w-12 text-right">0.5%</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Funding Interval (Hours)</Label>
                  <Input type="number" defaultValue="1" className="bg-background/50 border-primary/20 font-mono" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-primary/20 tech-border">
              <CardHeader>
                <CardTitle className="text-primary">Global Caps</CardTitle>
                <CardDescription>System-wide exposure limits.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Max Global OI ($)</Label>
                  <Input type="text" defaultValue="100,000,000" className="bg-background/50 border-primary/20 font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Max Leverage (System Wide)</Label>
                  <div className="flex items-center gap-4">
                    <Slider defaultValue={[100]} max={200} step={10} className="flex-1" />
                    <span className="font-mono text-primary w-12 text-right">100x</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assets">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Asset Configuration</CardTitle>
              <CardDescription>Select an asset to configure specific parameters.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Info className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select an asset from the monitoring dashboard to edit specific parameters.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emergency">
          <Card className="bg-destructive/5 border-destructive/20 tech-border">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <Info className="w-5 h-5" />
                Emergency Override Settings
              </CardTitle>
              <CardDescription>These settings will be applied when L3 Kill-Switch is activated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-destructive/20 rounded bg-destructive/10">
                  <div>
                    <Label className="text-destructive font-bold">Force Close Only</Label>
                    <p className="text-xs text-muted-foreground">Disable all new position openings globally.</p>
                  </div>
                  <div className="h-6 w-12 bg-destructive rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 h-4 w-4 bg-white rounded-full shadow-sm" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-destructive">Emergency Funding Multiplier</Label>
                  <div className="flex items-center gap-4">
                    <Slider defaultValue={[5]} max={10} step={1} className="flex-1" />
                    <span className="font-mono text-destructive w-12 text-right">5x</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Multiplier applied to funding rates during emergency state.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
