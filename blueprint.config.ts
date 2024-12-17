import { Config } from '@ton/blueprint';
import { ScaffoldPlugin } from 'blueprint-scaffold';
import { MistiPlugin } from '@nowarp/blueprint-misti';
export const config: Config = {
    plugins: [new ScaffoldPlugin(), new MistiPlugin()],
};
