//Check if the domain is whitelisted or blacklisted if both are false then continue with the below logic

import prisma from "../lib/prisma";

const urlId = process.argv[2] ?? "some-url-id";

function simulateLongProcess(duration: number, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`${message}: Process Starting`);
    setTimeout(() => {
      console.log(`${message}: Process Finishing`);
      // simulate a boolean result (e.g. indexed or not)
      resolve(Math.random() > 0.5);
    }, duration);
  });
}

const checkDomainRule = async (urlId: string): Promise<boolean | void> => {
  try {
    const urlDetail = await prisma.url.findUnique({
      where: { id: urlId },
      include: { domains: true },
    });

    if (!urlDetail || !urlDetail.domainId || !urlDetail.domains) {
      console.log("Invalid Url ID or no associated domain");
      return;
    }

    if (urlDetail.domains.blacklistedAt || urlDetail.domains.isWhitelisted) {
      const message = urlDetail.domains.blacklistedAt
        ? "Domain is blacklisted"
        : "Domain is whitelisted";
      console.log(message);
      return;
    }

    const isIndexed = await simulateLongProcess(2000, `Check URL ${urlId}`);
    console.log(`Result for ${urlId}: isIndexed=${isIndexed}`);
    return isIndexed;
  } catch (err) {
    console.error("Error checking domain rule:", err);
    throw err;
  }
};

checkDomainRule(urlId).catch((e) => {
  console.error("Unexpected error:", e);
});