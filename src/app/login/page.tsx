"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#0a0a0a" }}>
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#111111] to-[#0a0a0a]" />
        {/* Gold accent line */}
        <div className="absolute top-0 left-1/2 w-px h-full bg-gradient-to-b from-transparent via-[#d4a853]/20 to-transparent" />
        
        <div className="relative z-10 text-center">
          <h1
            className="text-6xl font-serif tracking-wide mb-2"
            style={{ color: "#f5e6c8" }}
          >
            effortless
          </h1>
          <div className="w-32 h-px mx-auto mb-3" style={{ backgroundColor: "#d4a853" }} />
          <p
            className="text-sm font-sans tracking-[0.3em] uppercase"
            style={{ color: "#d4a853" }}
          >
            MGMT
          </p>
          <p className="mt-8 text-gray-500 text-sm max-w-xs mx-auto leading-relaxed">
            Instagram account management platform for the modern agency
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-12">
            <h1
              className="text-4xl font-serif tracking-wide mb-1"
              style={{ color: "#f5e6c8" }}
            >
              effortless
            </h1>
            <div className="w-20 h-px mx-auto mb-2" style={{ backgroundColor: "#d4a853" }} />
            <p
              className="text-xs font-sans tracking-[0.3em] uppercase"
              style={{ color: "#d4a853" }}
            >
              MGMT
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold" style={{ color: "#f5e6c8" }}>
                Welcome back
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                Sign in to your account
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label className="text-gray-400">Email</Label>
                <Input
                  type="email"
                  placeholder="you@effortless.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:ring-[#d4a853] focus:border-[#d4a853]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-400">Password</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:ring-[#d4a853] focus:border-[#d4a853]"
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 text-base font-medium"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                    Signing in...
                  </div>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>

          <p className="text-center text-gray-600 text-xs mt-6">
            © {new Date().getFullYear()} Effortless MGMT. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
