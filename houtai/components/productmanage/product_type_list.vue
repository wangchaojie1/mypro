<template>
  <div class="product-type-list-index">
<el-form :inline="true" :model="formInline" class="demo-form-inline" size="mini">
  <el-form-item label="分类名称">
    <el-input v-model="formInline.name" placeholder="分类名称"></el-input>
  </el-form-item>
  <el-form-item label="分类描述">
    <el-input v-model="formInline.descript" placeholder="分类描述"></el-input>
  </el-form-item>
  <el-form-item>
    <el-button type="primary" @click="onSubmit">查询</el-button>
    <el-button type="primary" @click="onSubmit">添加产品分类</el-button>
  </el-form-item>
</el-form>
 <el-table size="mini"
    :data="tableData"
    border
    style="width: 100%">
    <el-table-column
      fixed
      prop="recommend"
      label="排序"
      >
     <template slot-scope="scope">
          <span>{{scope.row.recommend}}</span>
        </template> 
    </el-table-column>
    <el-table-column
      prop="name"
      label="产品名称"
      >
    </el-table-column>
    <el-table-column
      fixed
      prop="descript"
      label="产品描述"
      >
    </el-table-column>
    <el-table-column
      prop="src"
      label="图片">
      <template slot-scope="scope">
          <img
            style="width: 50px; height: 50px"
            :src="productUrl + scope.row.src"
          />
        </template>
    </el-table-column>
    <el-table-column
      prop="updateTime"
      label="更新时间"
      >
    </el-table-column>
    <el-table-column
      fixed="right"
      label="操作"
      >
      <template slot-scope="scope">
      
        <img :src="deletedPng" alt="这是删除" @click="delBtn(scope.row)">
      </template>
    </el-table-column>
 </el-table>
  </div>
</template>

<script>
import deletedPng from "img/delete.png"
export default {
  data() {
    return {
      formInline: {
        name: "",
        descript: "",
        page: 1,
        perpage: 10,
      },
      age:10,
      my:{
        sex:'男'
      },
      productUrl: cdn.productUrl,
      tableData:[],
      deletedPng,
      //键值对
      // key:value
    }
    
  },
  mounted (){//载入后
    this.getTableData(1)
  },

  methods: {
    delBtn(row){

console.log("delBtn",row.id);
console.log("delBtn",row.name);

    },
    onSubmit() {
      console.log("submit!");
    },
    getTableData:function (page){
    const requestData = {
      name:this.formInline.name,
      descript:this.formInline.descript,
      age:this.age,
      sex:this.my.sex,

    };
    console.log('===============',requestData);
    requestData.page = page;
    this.$rq
        .getAllRecommendProductTypeList(requestData)
        .then((res) => {
          this.tableData = res.data;
        })
    },
  },
};
</script>

<style lang="less">
.product-type-list-index {
  background: #ffffff;
  width: 96%;
  margin: 15px auto;
  input {
    width: 90% !important;
    height: 30px;
    line-height: 30px;
  }
  img{
    height: 18px;
    cursor: pointer;
  }
  .el-table--mini td, .el-table--mini th{
    padding: 1px !important
  }
}

</style>