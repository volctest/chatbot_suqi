interface NetworkInformation {
  downlink: number;
  effectiveType: string;
  rtt: number;
  saveData: boolean;
  type: string;
  onchange: () => void;
}

interface Navigator {
  connection?: NetworkInformation;
}
