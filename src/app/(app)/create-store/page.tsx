import { WandSparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { CreateStoreForm } from "./create-store-form";

export default function CreateStorePage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-2">
        <Badge variant="secondary">1-7 products</Badge>
        <h1 className="text-3xl font-semibold tracking-normal">
          Create Store
        </h1>
        <p className="text-sm text-muted-foreground">
          Turn one business idea into a concise, validated launch blueprint
          before any repository transformation begins.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WandSparkles className="size-5" />
            Store Brief
          </CardTitle>
          <CardDescription>
            Keep it punchy. StoreForge will infer the brand world, launch
            catalog, palette, and hero product for approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateStoreForm />
        </CardContent>
      </Card>
    </div>
  );
}
