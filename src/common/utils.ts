import axios from 'axios';
export async function getOptions(url: string, token: string) {
  if (url.startsWith('http')) {
    const options: any = {
      url,
      method: 'get',
    };
    if (token) {
      options.headers = {
        Authorization: `token ${token}`,
      };
    }
    return (await axios(options)).data;
  } else {
    return require(url);
  }
}
