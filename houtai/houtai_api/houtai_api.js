const fs = require("fs")
const uuid = require("uuid")
const path = require("path")
var LRU = require("lru-cache")
var svgCaptcha = require('svg-captcha');
const authConfig = require('../../config/admin.js')

function getLastParam(src) {
    const lastIndex = src.lastIndexOf('/')
    const img_name = src.substr(lastIndex + 1);

    const sec_src = src.substring(0, lastIndex);
    const sec_lastIndex = sec_src.lastIndexOf('/');
    const news_name = sec_src.substr(sec_lastIndex + 1)
    return [news_name, img_name]
}

module.exports = function (router, threadpool, reload, reloadNews, rebuildSitemap, al_client, news_client, db, config) {
    var adminCache = new LRU({
        max: 1000,
        maxAge: 60 * 1000 * 60
    })
    router.get('/houtai/productmanage/get_type_list', async (ctx) => {
        try {
            const { page = 1, perpage = 10, name = '', descript = '', sort = '' } = ctx.query;
            const sql = `SELECT * FROM product_type
                        WHERE name like '%${name}%' AND descript like '%${descript}%' ${sort ? `AND sort = ${sort}` : ''}
                        order by sort
                        limit ${(page - 1) * perpage},${perpage}`
            const sql1 = `select FOUND_ROWS()`

            const list_with_count = await new Promise((reso, reje) => {
                threadpool.getConnection(async function (err, connection) {
                    if (err) throw err; // not connected!

                    const type_list = await Promise.all((await new Promise((res, rej) => {
                        connection.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            };
                            res(results)
                        });
                    }))
                        .map(async _ => {
                            return {
                                ..._,
                                src: _.src
                            }
                        }))

                    const count = await new Promise((res, rej) => {
                        connection.query(sql1, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    connection.release();

                    reso({
                        list: type_list,
                        count: count[0]['FOUND_ROWS()']
                    })
                });
            })


            ctx.body = JSON.stringify({
                code: 200,
                total: list_with_count.count,
                data: list_with_count.list
            })
        }
        catch (err) {
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })
    router.post('/houtai/productmanage/change_type_info', async (ctx) => {
        try {

            const file = ctx.request.files && ctx.request.files.file
            const { name, descript, sort, id } = ctx.request.body
            let src = ctx.request.body.file

            // 去重判断
            const judge_sql = `select id from product_type where name = '${name}' and id <> '${id}'`;
            const hasProductType = await new Promise((res, rej) => {
                threadpool.query(judge_sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    }
                    res(results)
                })
            })
            if (hasProductType && hasProductType[0]) {
                if (file) {
                    fs.unlinkSync(file.path) //删除临时存储文件
                }
                ctx.body = JSON.stringify({
                    code: 400,
                    data: 1,
                    msg: `${name}产品分类名称已存在`
                })
                return
            }

            if (file) {
                var path = file.path.replace(/\\/g, '/');
                var fname = file.name;
                var nextPath = '';
                if (file.size > 0 && path) {
                    const old_src = await new Promise((res, rej) => {
                        const sql = `select src from product_type where id = '${id}'`
                        threadpool.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })
                    if (old_src && old_src[0]) {
                        await al_client.delete(old_src[0].src)
                    }

                    var extArr = fname.split('.');
                    var ext = extArr[extArr.length - 1]
                    nextPath = path + '.' + ext;
                    // await al_client.put(nextPath.slice(nextPath.lastIndexOf('/') + 1), file.path)
                    // src = await al_client.generateObjectUrl(nextPath.slice(nextPath.lastIndexOf('/') + 1)).replace('http', 'https')
                    src = name.replace(/\s/g, '-') + '.' + ext
                    await al_client.put(src, file.path)
                    await fs.unlinkSync(file.path) //删除临时存储文件

                }
            }
            else {
                const buffer = (await al_client.get(src)).content;
                await al_client.delete(src);
                src = name.replace(/\s/g, '-') + '.' + src.substr(src.lastIndexOf('.') + 1)
                await al_client.put(src, buffer)
            }
            await new Promise((res, rej) => {
                const sql = `replace into product_type(id, parentId, name, descript, updateTime, sort, src)
                            values('${id || uuid.v4()}','','${name}','${descript}','${new Date().getTime()}', ${sort}, '${src}')`
                threadpool.query(sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    };
                    res(results)
                });
            })
            ctx.body = JSON.stringify({
                code: 200,
                data: 1
            })
            reload().then(r => {
                rebuildSitemap()
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    }),
        router.post('/houtai/productmanage/delete_type', async (ctx) => {
            try {
                const { id, src } = ctx.request.body
                const sql = `delete from product_type where id = '${id}'`;

                await new Promise((res, rej) => {
                    threadpool.query(sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })
                await al_client.delete(src)


                const products = await new Promise((res, rej) => {
                    const sql = `select imgSrc from product_list where typeID = '${id}'`;
                    threadpool.query(sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })


                products.forEach(async _ => {
                    await al_client.delete(_.imgSrc)
                })

                await new Promise((res, rej) => {
                    const sql = `delete from product_list where typeId = '${id}'`;
                    threadpool.query(sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })


                ctx.body = JSON.stringify({
                    code: 200,
                    data: 1
                })
                reload().then(r => {
                    rebuildSitemap()
                })
            }
            catch (err) {
                console.log(err)
                ctx.body = JSON.stringify({
                    code: 500,
                    data: ''
                })
            }
        })


    // 子分类相关接口
    router.get('/houtai/productmanage/get_product_list', async (ctx) => { // 子产品列表
        try {
            const { typeId, list_name = '', descript = '', beginTime = 0, endTime = 9999999999999, page = 1, perpage = 10 } = ctx.query;

            const sql = `SELECT SQL_CALC_FOUND_ROWS * FROM product_list
                        WHERE typeID = '${typeId}' AND list_name like '%${list_name}%' AND descript like '%${descript}%'
                        AND updateTime BETWEEN ${beginTime || 0} AND ${endTime || 9999999999999}
                        limit ${(page - 1) * perpage},${perpage}`
            const sql1 = `select FOUND_ROWS()`

            const list_with_count = await new Promise((reso, reje) => {
                threadpool.getConnection(async function (err, connection) {
                    if (err) throw err; // not connected!

                    const product_list = await Promise.all((await new Promise((res, rej) => {
                        connection.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    }))
                        .map(async _ => {
                            return {
                                ..._,
                                imgSrc: _.imgSrc
                            }
                        }))

                    const count = await new Promise((res, rej) => {
                        connection.query(sql1, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    connection.release();

                    reso({
                        list: product_list,
                        count: count[0]['FOUND_ROWS()']
                    })
                });
            })

            ctx.body = JSON.stringify({
                code: 200,
                total: list_with_count.count,
                data: list_with_count.list
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: err
            })
        }
    })

    router.post('/houtai/productmanage/change_product_info', async (ctx) => { // 添加和修改某分类下产品
        try {
            const file = ctx.request.files && ctx.request.files.file
            const { list_name = '', descript = '', detail = '', id = '', typeId = '' } = ctx.request.body
            let src = ctx.request.body.file

            // 去重判断
            const judge_sql = `select id from product_list where list_name = '${list_name}' and id <> '${id}'`;
            const hasProduct = await new Promise((res, rej) => {
                threadpool.query(judge_sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    }
                    res(results)
                })
            })
            if (hasProduct && hasProduct[0]) {
                if (file) {
                    fs.unlinkSync(file.path) //删除临时存储文件
                }
                ctx.body = JSON.stringify({
                    code: 400,
                    data: 1,
                    msg: `${list_name}产品名称已存在`
                })
                return
            }

            if (file) {
                var path = file.path.replace(/\\/g, '/');
                var fname = file.name;
                var nextPath = '';
                if (file.size > 0 && path) {
                    const old_src = await new Promise((res, rej) => {
                        const sql = `select imgSrc from product_list where id = '${id}'`
                        threadpool.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })
                    if (old_src && old_src[0]) {
                        await al_client.delete(old_src[0].imgSrc)
                    }

                    var extArr = fname.split('.');
                    var ext = extArr[extArr.length - 1]
                    nextPath = path + '.' + ext;
                    // await al_client.put(nextPath.slice(nextPath.lastIndexOf('/') + 1), file.path)
                    // src = al_client.generateObjectUrl(nextPath.slice(nextPath.lastIndexOf('/') + 1)).replace('http', 'https')
                    src = list_name.replace(/\s/g, '-') + '.' + ext
                    await al_client.put(src, file.path)
                    await fs.unlinkSync(file.path) //删除临时存储文件

                }
            }
            else {
                const buffer = (await al_client.get(src)).content;
                await al_client.delete(src);
                src = list_name.replace(/\s/g, '-') + '.' + src.substr(src.lastIndexOf('.') + 1)
                await al_client.put(src, buffer)
            }

            await new Promise((res, rej) => {
                const sql = `replace into product_list(id, typeID, imgSrc, descript, updateTime, detail, list_name)
                            values('${id || uuid.v4()}','${typeId}','${src}','${descript}','${new Date().getTime()}', '${detail}', '${list_name}')`
                threadpool.query(sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    };
                    res(results)
                });
            })
            ctx.body = JSON.stringify({
                code: 200,
                data: 1
            })
            reload().then(r => {
                rebuildSitemap()
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: err
            })
        }
    })

    router.post('/houtai/productmanage/delete_product', async (ctx) => { // 删除某分类id 下的产品
        try {
            const { id, typeId, imgSrc } = ctx.request.body
            const sql = `delete from product_list where id = '${id}' AND typeID = '${typeId}'`;

            await new Promise((res, rej) => {
                threadpool.query(sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    }
                    res(results)
                })
            })

            await al_client.delete(imgSrc)
            ctx.body = JSON.stringify({
                code: 200,
                data: 1
            })
            reload().then(r => {
                rebuildSitemap()
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    // ———————————————————————————————————推荐相关分割线————————————————————————————————————————————————————————————————

    /**
     * 获取所有产品列表进行选择推荐
     */
    router.get('/houtai/recommendmanage/get_all_product_list', async (ctx) => {
        try {
            const { list_name, descript, detail, page, perpage } = ctx.request.query
            const sql = `SELECT SQL_CALC_FOUND_ROWS * from product_list
                        where list_name like '%${list_name}%' AND descript like '%${descript}%' AND detail like '%${detail}%'
                        limit ${(page - 1) * perpage},${perpage}`

            const list_with_count = await new Promise((reso, reje) => {
                threadpool.getConnection(async function (err, connection) {
                    if (err) throw err; // not connected!

                    const product_list = await new Promise((res, rej) => {
                        connection.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })

                    })

                    const count = await new Promise((res, rej) => {
                        connection.query('select FOUND_ROWS()', function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    connection.release();
                    reso({
                        list: product_list,
                        count: count[0]['FOUND_ROWS()']
                    })
                });
            })

            ctx.body = JSON.stringify({
                code: 200,
                total: list_with_count.count,
                data: list_with_count.list
            })

        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    /**
     * 获取推荐商品的列表，现在只有6个
     */
    router.get('/houtai/recommendmanage/get_recommend_product_list', async (ctx) => {
        try {
            const { list_name, descript, detail, page, perpage } = ctx.request.query
            const sql = `SELECT SQL_CALC_FOUND_ROWS * from product_list
                        where list_name like '%${list_name}%' AND descript like '%${descript}%' AND detail like '%${detail}%' AND recommend != 0 order by recommend desc
                        limit ${(page - 1) * perpage},${perpage}`

            const list_with_count = await new Promise((reso, reje) => {
                threadpool.getConnection(async function (err, connection) {
                    if (err) throw err; // not connected!

                    const product_list = await new Promise((res, rej) => {
                        connection.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })

                    })

                    const count = await new Promise((res, rej) => {
                        connection.query('select FOUND_ROWS()', function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    connection.release();
                    reso({
                        list: product_list,
                        count: count[0]['FOUND_ROWS()']
                    })
                });
            })

            ctx.body = JSON.stringify({
                code: 200,
                total: list_with_count.count,
                data: list_with_count.list
            })

        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    /**
     * 改变某一商品的推荐状态
     */
    router.post('/houtai/recommendmanage/change_recommend_status', async (ctx) => {
        try {
            const { id, flag } = ctx.request.body

            if (flag == 1) {
                const judge_sql = `select count(*) as count from product_list where recommend = 1`

                const count = await new Promise((res, rej) => {
                    threadpool.query(judge_sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })
                if (count[0].count > 5) {
                    ctx.body = JSON.stringify({
                        code: 3,
                        data: 0,
                        msg: '最多添加6个推荐商品'
                    })
                    return
                }

            }

            const sql = `update product_list set recommend = ${flag} where id = '${id}'`
            await new Promise((res, rej) => {
                threadpool.query(sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    }
                    res(results)
                })
            })

            ctx.body = JSON.stringify({
                code: 200,
                data: 1
            })
            reload().then(r => {
                rebuildSitemap()
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })


    /**新闻相关分割线———————————————————————————————————————————————————— */
    /**
     * 获取所有产品列表进行选择推荐
     */
    router.get('/houtai/newsmanage/get_news_list', async (ctx) => {
        try {
            const { title, content, beginTime, endTime, page, perpage } = ctx.request.query
            const sql = `SELECT SQL_CALC_FOUND_ROWS * from  news
                        where title like '%${title}%' AND content like '%${content}%' AND unix_timestamp(creationTimestamp) between ${new Date(beginTime).getTime()} and ${new Date(endTime).getTime()}
                        limit ${(page - 1) * perpage},${perpage}`

            const list_with_count = await new Promise((reso, reje) => {
                threadpool.getConnection(async function (err, connection) {
                    if (err) throw err; // not connected!

                    const news_list = await new Promise((res, rej) => {
                        connection.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })

                    })

                    const count = await new Promise((res, rej) => {
                        connection.query('select FOUND_ROWS()', function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    connection.release();
                    reso({
                        list: news_list,
                        count: count[0]['FOUND_ROWS()']
                    })
                });
            })

            ctx.body = JSON.stringify({
                code: 200,
                total: list_with_count.count,
                data: list_with_count.list
            })

        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    router.post('/houtai/newsmanage/delete_news', async (ctx) => {
        try {
            const { id } = ctx.request.body
            if (!id) {
                ctx.body = JSON.stringify({
                    code: 400,
                    data: '缺少新闻id参数'
                })
                return
            }
            const [entity] = await new Promise((res, rej) => {
                const sql = `select titleImg, content from news where id = '${id}'`
                threadpool.query(sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    }
                    res(results)
                })
            })

            if (!entity) {
                ctx.body = JSON.stringify({
                    code: 400,
                    data: '不存在的新闻id'
                })
                return
            }

            // 删除数据
            const sql = `delete from news where id = '${id}'`
            threadpool.query(sql, function (error, results, fields) {
                reloadNews().then(r => {
                    rebuildSitemap()
                })
                if (error) {
                    throw error
                }
            })

            // 删除封面图
            if (entity.titleImg) {
                al_client.delete(entity.titleImg)
            }

            // 删除内容中的oss
            if (entity.content) {
                old_content = entity.content
                var regex = /<img src=[^>]*>/
                const oldImgLength = old_content.match(new RegExp(regex, 'g')) && old_content.match(new RegExp(regex, 'g')).length || 0
                for (var i = 0; i < oldImgLength; i++) {
                    const str = old_content.match(regex)[0]
                    const src = str.substring(str.indexOf(`"`) + 1, str.lastIndexOf(`"`))
                    const [news_name, img_name] = getLastParam(src)
                    al_client.delete(news_name + '_' + img_name)
                    old_content = old_content.replace(str, 123)
                }
            }

            ctx.body = JSON.stringify({
                code: 200,
                data: entity
            })

        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    router.post('/houtai/newsmanage/change_news', async (ctx) => {
        try {
            // const file = ctx.request.files && ctx.request.files.file
            var { id, title, content, imgName, imgFace } = ctx.request.body

            const imgNameArry = imgName
            const imgFaceIndex = imgFace
            let imgFaceType = undefined
            const formatTitle = title.replace(/\s/g, '-')
            // if (file) {
            //     var path = file.path.replace(/\\/g, '/');
            //     var fname = file.name;
            //     var nextPath = '';
            //     if (file.size > 0 && path) {
            //         var extArr = fname.split('.');
            //         var ext = extArr[extArr.length - 1]
            //         nextPath = path + '.' + ext;
            //         src = imgName
            //         await al_client.put(imgName, file.path)
            //         fs.unlinkSync(file.path) //删除临时存储文件

            //         const old_src = await new Promise((res, rej) => {
            //             const sql = `select titleImg from news where id = '${id}'`
            //             threadpool.query(sql, function (error, results, fields) {
            //                 if (error) {
            //                     throw error
            //                 }
            //                 res(results)
            //             })
            //         })
            //         if (old_src && old_src[0]) {
            //             al_client.delete(old_src[0].titleImg)
            //         }
            //     }
            // }
            if (content) {
                if (!id) {
                    var regex = /<img src="data:image[^>]*>/
                    var newImglength = content.match(new RegExp(regex, 'g')) && content.match(new RegExp(regex, 'g')).length || 0
                    console.log(newImglength)
                    for (var i = 0; i < newImglength; i++) {
                        var imgstr = content.match(regex)[0];
                        var imgType = imgstr.substring(imgstr.indexOf('/') + 1, imgstr.indexOf(';'))
                        var buffer = Buffer.from(imgstr.substring(imgstr.indexOf(`,`) + 1, imgstr.lastIndexOf(`"`)), 'base64');

                        var uuName = formatTitle + '_' + imgNameArry[i] + '.' + imgType

                        await al_client.put(uuName, buffer)
                        // var newstr = await news_client.generateObjectUrl(uuName).replace('http', 'https')
                        content = content.replace(regex, `<img src="${config.cdn.newsUrl + formatTitle + '/' + imgNameArry[i] + '.' + imgType}"/>`)

                        if (i == imgFaceIndex) {
                            imgFaceType = imgType
                        }
                    }
                }
                else {
                    const [old_content] = await new Promise((res, rej) => {
                        const sql = `select content from news where id = '${id}'`
                        threadpool.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    // 删掉旧的无用的图片
                    const old_regex = /<img src=[^>]*>/
                    const oldImgLength = old_content.content.match(new RegExp(old_regex, 'g')) && old_content.content.match(new RegExp(old_regex, 'g')).length || 0
                    for (var i = 0; i < oldImgLength; i++) {
                        const str = old_content.content.match(old_regex)[0]
                        const src = str.substring(str.indexOf(`"`) + 1, str.lastIndexOf(`"`))
                        if (content.indexOf(src) == -1) {
                            const [news_name, img_name] = getLastParam(src)
                            al_client.delete(news_name + '_' + img_name)
                        }
                        old_content.content = old_content.content.replace(old_regex, 123)
                    }

                    const regex_base64 = /<img src="data:image[^>]*>/
                    const regex = /<img src=[^>]*>/
                    var newImglength = content.match(new RegExp(regex, 'g')) && content.match(new RegExp(regex, 'g')).length || 0
                    for (var i = 0; i < newImglength; i++) {
                        var imgstr = content.match((new RegExp(regex, 'g')))[i];
                        var imgType;
                        if (imgstr.match(new RegExp(regex_base64, 'g'))) {
                            imgType = imgstr.substring(imgstr.indexOf('/') + 1, imgstr.indexOf(';'))
                            var buffer = Buffer.from(imgstr.substring(imgstr.indexOf(`,`) + 1, imgstr.lastIndexOf(`"`)), 'base64');

                            var uuName = formatTitle + '_' + imgNameArry[i] + '.' + imgType

                            await al_client.put(uuName, buffer)
                            // var newstr = await news_client.generateObjectUrl(uuName).replace('http', 'https')
                            content = content.replace(imgstr, `<img src="${config.cdn.newsUrl + formatTitle + '/' + imgNameArry[i] + '.' + imgType}"/>`)
                        }
                        else {
                            imgType = imgstr.substring(imgstr.indexOf('.') + 1, imgstr.lastIndexOf('"'));
                            const url = imgstr.substring(
                                imgstr.indexOf('"') + 1,
                                imgstr.lastIndexOf('"')
                            );
                            const [news_name, img_name] = getLastParam(url)
                            var oldName = news_name + '_' + img_name;
                            var buffer = (await al_client.get(oldName)).content;

                            var uuName = formatTitle + '_' + imgNameArry[i] + '.' + imgType

                            al_client.delete(oldName);
                            await al_client.put(uuName, buffer);
                            content = content.replace(imgstr, `<img src="${config.cdn.newsUrl + formatTitle + '/' + imgNameArry[i] + '.' + imgType}"/>`)
                        }
                        if (i == imgFaceIndex) {
                            imgFaceType = imgType
                        }
                    }
                }
            }
            await new Promise((res, rej) => {
                const sql = `replace into news(id, title, titleImg, content)
                            values('${id || uuid.v4()}', '${formatTitle}', '${imgNameArry[imgFaceIndex] + '.' + imgFaceType}', '${content.replace(/\'/g, "''")}')`
                threadpool.query(sql, function (error, results, fields) {
                    if (error) {
                        throw error
                    };
                    res(results)
                });
            })
            reloadNews().then(r => {
                rebuildSitemap()
            })
            ctx.body = JSON.stringify({
                code: 200,
                data: 1
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })
    // 用户统计相关
    router.get('/houtai/userRecord/user_record_list', async (ctx) => {
        try {
            const { location, ip, creationTimeFrom, creationTimeTo, page, perpage = 10 } = ctx.request.query;
            const sql = `SELECT SQL_CALC_FOUND_ROWS * from  user
                        where location like '%${location || ''}%' AND ip like '%${ip || ''}%' AND unix_timestamp(creationTime) between ${new Date(creationTimeFrom).getTime() / 1000 || new Date(0).getTime() / 1000} and ${new Date(creationTimeTo).getTime() / 1000 || new Date().getTime() / 1000}
                        order by creationTime DESC
                        limit ${(page - 1) * perpage},${perpage}`;
            const [users, connection] = await db.connection(sql);
            const [count, connection1] = await db.use_connection(connection, `select FOUND_ROWS()`);
            connection1.release();

            ctx.body = JSON.stringify({
                code: 200,
                total: count[0]['FOUND_ROWS()'],
                data: users
            })

        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    // 登录相关
    router.get('/getCaptcha', async (ctx) => {
        var codeConfig = {
            size: 5,// 验证码长度
            noise: 2, // 干扰线条的数量
            height: 44
        }
        var captcha = svgCaptcha.create(codeConfig);
        var cookie = uuid.v4()
        adminCache.set(cookie, captcha.text.toLowerCase())
        ctx.cookies.set('ruige_auth', cookie)
        ctx.set('Content-Type', 'image/svg+xml')
        ctx.body = captcha.data;

    })

    router.post('/login', async (ctx) => {
        const { username, password, captcha } = ctx.request.body
        const auth = ctx.cookies.get('ruige_auth')
        if (captcha != adminCache.get(auth)) {
            ctx.body = JSON.stringify({
                code: 1,
                data: '',
                msg: '用户名或密码或验证码不正确'
            })
            return
        }

        if (username != authConfig.username || password != authConfig.password) {
            ctx.body = JSON.stringify({
                code: 1,
                data: '',
                msg: '用户名或密码或验证码不正确'
            })
            return
        }
        ctx.body = JSON.stringify({
            code: 200,
            data: authConfig.auth
        })

    })

    /*——————————————————————  底部商品分类推荐 ——————————————————————————*/
    router.get('/houtai/recommendmanage/get_recommend_product_type_list', async (ctx) => {
        try {
            const { name, descript, detail, page = 1, perpage = 10 } = ctx.request.query
            const sql = `SELECT SQL_CALC_FOUND_ROWS * from product_type
                        where name like '%${name}%' AND descript like '%${descript}%' AND recommend is not null order by recommend desc
                        limit ${(page - 1) * perpage},${perpage}`

            const list_with_count = await new Promise((reso, reje) => {
                threadpool.getConnection(async function (err, connection) {
                    if (err) throw err; // not connected!

                    const product_type_list = await new Promise((res, rej) => {
                        connection.query(sql, function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })

                    })

                    const count = await new Promise((res, rej) => {
                        connection.query('select FOUND_ROWS()', function (error, results, fields) {
                            if (error) {
                                throw error
                            }
                            res(results)
                        })
                    })

                    connection.release();
                    reso({
                        list: product_type_list,
                        count: count[0]['FOUND_ROWS()']
                    })
                });
            })

            ctx.body = JSON.stringify({
                code: 200,
                total: list_with_count.count,
                data: list_with_count.list
            })

        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

    /**
     * 改变某一商品分类的底部推荐状态
     */
    router.post('/houtai/recommendmanage/change_product_type_recommend_status', async (ctx) => {
        try {
            const { id, flag } = ctx.request.body

            if (flag == 1) {
                const judge_sql = `select count(*) as count, MAX(recommend) as max from product_type where recommend is not null`

                const count = await new Promise((res, rej) => {
                    threadpool.query(judge_sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })
                if (count[0].count > 4) {
                    ctx.body = JSON.stringify({
                        code: 3,
                        data: 0,
                        msg: '最多添加5个推荐商品'
                    })
                    return
                }

                const sql = `update product_type set recommend = ${count[0].max + 1} where id = '${id}'`
                await new Promise((res, rej) => {
                    threadpool.query(sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })

            }
            else {
                const sql = `update product_type set recommend = NULL where id = '${id}'`
                await new Promise((res, rej) => {
                    threadpool.query(sql, function (error, results, fields) {
                        if (error) {
                            throw error
                        }
                        res(results)
                    })
                })
            }


            ctx.body = JSON.stringify({
                code: 200,
                data: 1
            })
            reload().then(r => {
                rebuildSitemap()
            })
        }
        catch (err) {
            console.log(err)
            ctx.body = JSON.stringify({
                code: 500,
                data: ''
            })
        }
    })

}