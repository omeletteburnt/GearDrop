export type Category = "PC/Laptops" | "Keyboards" | "Mouses" | "Mics" | "Headsets";
export type Listing = {
  id: number; name: string; category: Category; price: number; condition: "Like new" | "Good" | "Fair";
  status: "Available" | "Reserved" | "Sold"; image: string; description: string; specs: Record<string, string>;
  missing: string[]; seller: string; posted: string;
};

export const categories: { name: Category; icon: string; hint: string }[] = [
  { name: "PC/Laptops", icon: "▣", hint: "GPU, CPU, RAM, storage" },
  { name: "Keyboards", icon: "⌨", hint: "switches, layout, size" },
  { name: "Mouses", icon: "◉", hint: "weight, sensor, wireless" },
  { name: "Mics", icon: "◌", hint: "USB/XLR, pickup pattern" },
  { name: "Headsets", icon: "◖", hint: "wired, wireless, platform" },
];

export const listings: Listing[] = [
  { id: 1, name: "Logitech G Pro X Superlight", category: "Mouses", price: 78, condition: "Good", status: "Available", image: "🖱️", description: "A tournament-ready, lightweight wireless mouse. Includes receiver and cable.", specs: { Weight: "63 g", Connection: "Wireless", Sensor: "HERO 25K", Color: "White" }, missing: [], seller: "Kai", posted: "2 hours ago" },
  { id: 2, name: "Razer Huntsman Mini", category: "Keyboards", price: 62, condition: "Like new", status: "Available", image: "⌨️", description: "Compact 60% optical keyboard with original box and cable.", specs: { Layout: "60%", Switches: "Linear optical", Connection: "Wired", Lighting: "RGB" }, missing: [], seller: "Mina", posted: "5 hours ago" },
  { id: 3, name: "HyperX Cloud II Wireless", category: "Headsets", price: 55, condition: "Good", status: "Available", image: "🎧", description: "Comfortable wireless headset for PC and PlayStation. Fresh ear pads included.", specs: { Connection: "Wireless", Battery: "Up to 30 hours", Platform: "PC, PlayStation", Microphone: "Detachable" }, missing: ["Exact battery health"], seller: "Rey", posted: "Yesterday" },
  { id: 4, name: "Blue Yeti USB Microphone", category: "Mics", price: 70, condition: "Good", status: "Reserved", image: "🎙️", description: "USB desktop microphone with multiple pickup patterns and a sturdy stand.", specs: { Connection: "USB", Pattern: "Cardioid, omni, stereo", Monitoring: "3.5 mm", Stand: "Included" }, missing: ["Whether a USB cable is included"], seller: "Jules", posted: "Yesterday" },
  { id: 5, name: "ASUS ROG Zephyrus G14", category: "PC/Laptops", price: 740, condition: "Good", status: "Available", image: "💻", description: "Portable gaming laptop. Clean installation of Windows, charger included.", specs: { CPU: "Ryzen 9 5900HS", GPU: "RTX 3060", RAM: "16 GB", Storage: "1 TB SSD" }, missing: ["Battery health", "Screen refresh rate"], seller: "Noah", posted: "2 days ago" },
  { id: 6, name: "SteelSeries Arctis 7", category: "Headsets", price: 42, condition: "Fair", status: "Available", image: "🎧", description: "Wireless headset with a clear retractable mic. Cosmetic wear on the headband.", specs: { Connection: "Wireless", Platform: "PC, PlayStation", Microphone: "Retractable", Color: "Black" }, missing: ["Battery health", "Original receiver included"], seller: "Ari", posted: "3 days ago" },
  { id: 7, name: "Keychron K2", category: "Keyboards", price: 49, condition: "Good", status: "Available", image: "⌨️", description: "Hot-swappable 75% mechanical keyboard, ideal for work and gaming.", specs: { Layout: "75%", Switches: "Gateron Brown", Connection: "Bluetooth / wired", Lighting: "White backlight" }, missing: [], seller: "Sam", posted: "3 days ago" },
  { id: 8, name: "Razer Viper Mini", category: "Mouses", price: 22, condition: "Good", status: "Sold", image: "🖱️", description: "Small wired gaming mouse in excellent working condition.", specs: { Weight: "61 g", Connection: "Wired", Sensor: "8500 DPI", Color: "Black" }, missing: ["Original packaging"], seller: "Chen", posted: "4 days ago" },
  { id: 9, name: "Elgato Wave 3", category: "Mics", price: 96, condition: "Like new", status: "Available", image: "🎙️", description: "USB microphone with clipguard and Wave Link mixing software support.", specs: { Connection: "USB-C", Pattern: "Cardioid", Monitoring: "3.5 mm", Stand: "Included" }, missing: [], seller: "Tara", posted: "5 days ago" },
  { id: 10, name: "Custom RTX 3070 Gaming PC", category: "PC/Laptops", price: 880, condition: "Like new", status: "Available", image: "🖥️", description: "Ready-to-play desktop with a clean cable build. Collection only.", specs: { CPU: "Ryzen 5 5600X", GPU: "RTX 3070", RAM: "32 GB", Storage: "1 TB NVMe" }, missing: ["Power-supply model", "Benchmark results"], seller: "Dev", posted: "1 week ago" }
];
