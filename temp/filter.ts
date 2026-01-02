interface Data {
  url: string;
  domain: string;
  projectId: string;
}

const urlArray = [
    "https://example1.com",
    "https://example2.com",
    "https://example3.com",
]

const data: Data[] = [
    {
        url: "https://example1.com",
        domain: "example.com",
        projectId: "230pinfr203hbfi32",
    },
    {
        url: "https://example2.com",
        domain: "example.com",
        projectId: "230pinfr203hbfi32",
    },
    {
        url: "https://example3.com",
        domain: "example.com",
        projectId: "230pinfr203hbfi32",
    },
    {
        url: "https://example4.com",
        domain: "example.com",
        projectId: "230pinfr203hbfi32",
    },
    {
        url: "https://example5.com",
        domain: "example.com",
        projectId: "230pinfr203hbfi32",
    },
    {
        url: "https://example6.com",
        domain: "example.com",
        projectId: "230pinfr203hbfi32",
    },
]

function filterData(data: Data[], urls: string[]): Data[] {
    return data.filter(item => urls.includes(item.url));
}

const filteredData = filterData(data, urlArray);

console.log(filteredData);