import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function BackButton({ to = "/", label = "Back" }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="flex items-center text-gray-600 hover:text-black px-0 justify-start"
      asChild
    >
      <Link to={to}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}