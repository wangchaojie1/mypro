import axios from "axios"
import router from "../route/route.js"
import Vue from "vue";

var request = axios.create({
    baseURL: '/',
    //baseURL: 'http://localhost:3000',
    //timeout:10000,
    headers: {
        "Content-Type": 'application/json'
    }
});

request.interceptors.request.use(function (config) {
    config.headers.auth = localStorage.auth;
    return config
}, function (error) {
    notice({
        title: '警告',
        message: error,
        type: 'error'
    })
})

request.interceptors.response.use(function (response) {
    console.log(response)
    if (response.data.code == '200') {
        return Promise.resolve(response.data);
    } else if (response.data.code == '303') {
        Vue.prototype.$notify({
            title: '提示',
            message: '请登录',
            type: "warning"
        })
        router.push({ path: '/login' })
        return Promise.reject(false)
    }
    else if (response.data.code == '1') {
        Vue.prototype.$notify({
            title: '提示',
            message: response.data.msg,
            type: "warning"
        })
        return Promise.reject(false)
    }
    else {
        Vue.prototype.$notify({
            title: '警告',
            message: response.data.msg,
            type: 'error'
        })
        return Promise.reject(false)
    }
}, function (error) {
    Vue.prototype.$notify({
        title: '警告',
        message: error,
        type: 'error'
    })
    return Promise.reject(false)
})

var apis = {
    imgSrc: 'http://localhost:3000',
    getTypeList: function (params) {
        return request({
            url: '/houtai/productmanage/get_type_list',
            method: 'get',
            params
        })
    },
    saveType: function (data) {
        return request({
            url: '/houtai/productmanage/change_type_info',
            method: 'post',
            data
        })
    },
    deleteType: function (data) {
        return request({
            url: '/houtai/productmanage/delete_type',
            method: 'post',
            data
        })
    },
    ///houtai/productmanage/get_product_list
    getProductList: function (params) {
        return request({
            url: "/houtai/productmanage/get_product_list",
            method: 'get',
            params
        })
    },
    deleteProduct: function (data) {
        return request({
            url: '/houtai/productmanage/delete_product',
            method: 'post',
            data
        })
    },
    changeProduct: function (data) {
        return request({
            url: '/houtai/productmanage/change_product_info',
            method: 'post',
            data
        })
    },

    //  推荐管理相关
    getAllProductList: function (params) {
        return request({
            url: '/houtai/recommendmanage/get_all_product_list',
            method: 'get',
            params
        })
    },
    changeRecommendStatus: function (data) {
        return request({
            url: '/houtai/recommendmanage/change_recommend_status',
            method: 'post',
            data
        })
    },
    getAllRecommendProductList: function (params) {
        return request({
            url: '/houtai/recommendmanage/get_recommend_product_list',
            method: 'get',
            params
        })
    },
    
    //  底部栏产品管理相关
    //商品分类推荐列表
    getAllRecommendProductTypeList: function (params) {
        return request({
            url: '/houtai/recommendmanage/get_recommend_product_type_list',
            method: 'get',
            params
        })
    },
    //修改底部商品分类接口
    changeProductTypeStatus: function (data) {
        return request({
            url: '/houtai/recommendmanage/change_product_type_recommend_status',
            method: 'post',
            data
        })
    },
    //获取商品分类可选择的列表
    getAllProductTypeList: function (params) {
        return request({
            url: '/houtai/productmanage/get_type_list',
            method: 'get',
            params
        })
    },

    // 新闻相关
    getNewsList: function (params) {
        return request({
            url: '/houtai/newsmanage/get_news_list',
            method: 'get',
            params
        })
    },

    changeNews: function (data) {
        return request({
            url: '/houtai/newsmanage/change_news',
            method: 'post',
            data
        })
    },

    deleteNews: function (data) {
        return request({
            url: '/houtai/newsmanage/delete_news',
            method: 'post',
            data
        })
    },

    // 用户相关
    login: function (data) {
        return request({
            url: '/login',
            method: 'post',
            data
        })
    },

    // 用户访问记录相关
    getUserRecordList: function (params) {
        return request({
            url: '/houtai/userRecord/user_record_list',
            method: 'get',
            params
        })
    }

}
export default {
    install: function (Vue) {
        Vue.prototype.$rq = apis
    }
}