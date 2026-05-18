import { CreateStoreHero } from "./create-store-hero";
import { getPendingCreateStorePrompt } from "./actions";

export default async function CreateStorePage() {
  const initialPrompt = await getPendingCreateStorePrompt();

  return <CreateStoreHero initialPrompt={initialPrompt} />;
}
