import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Mail, Phone, MapPin, Send } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-apc-primary mb-8">Contact Us</h1>
        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <MapPin className="h-6 w-6 text-apc-primary mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900">PolitiCore Operations Center</h3>
                <p className="text-gray-600">
                  PolitiCore Platform Headquarters & Operations Secretariat
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <Phone className="h-6 w-6 text-apc-primary mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900">Phone</h3>
                <p className="text-gray-600">+234 800 765 4842</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <Mail className="h-6 w-6 text-apc-primary mt-1" />
              <div>
                <h3 className="font-semibold text-gray-900">Email</h3>
                <p className="text-gray-600">contact@politicore.org</p>
              </div>
            </div>
          </div>

          <form className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="text-xl font-semibold text-apc-primary mb-2">
              Send a Message
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-apc-primary"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-apc-primary"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                rows={4}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-apc-primary"
                placeholder="Your message..."
              ></textarea>
            </div>
            <button
              type="submit"
              className="flex items-center justify-center space-x-2 bg-apc-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-apc-dark transition-colors w-full"
            >
              <Send className="h-4 w-4" />
              <span>Send Message</span>
            </button>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
