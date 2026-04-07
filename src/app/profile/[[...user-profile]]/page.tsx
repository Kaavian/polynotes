import { UserProfile } from "@clerk/nextjs";

export default function ProfilePage() {
  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:py-12 flex flex-col items-center">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 tracking-tight">Account Settings</h1>
        <p className="text-foreground/60">Manage your profile securely</p>
      </div>
      <div className="w-full flex justify-center">
        <UserProfile 
          path="/profile"
          routing="path"
          appearance={{
            elements: {
              card: "shadow-sm border border-border rounded-xl",
              navbar: "hidden sm:flex",
              headerTitle: "text-foreground",
              headerSubtitle: "text-foreground/60"
            }
          }}
        />
      </div>
    </div>
  );
}
